# Valorant Discord Bot Prototype

A Discord bot that displays Valorant player stats inspired by Tracker.gg. Built with Node.js and discord.js.

**Status**: Student portfolio prototype - works locally, not production-ready.

## Features

- **`/ping`** - Health check command to verify the bot is alive
- **`/valorant-profile`** - Display player profile with rank, stats, K/D, ACS, and more
- **`/valorant-recent`** - Display last 5 recent matches with agent, map, score, and performance metrics
- **Mock data mode** - Bot works without API key during development
- **In-memory caching** - 5-minute TTL to reduce API calls
- **Clean Discord embeds** - Tracker.gg-inspired stat display

## Reference Stats (Mock Data)

The bot is pre-configured with mock data based on a Tracker.gg Valorant profile:
- **Riot ID**: SongSiDiYa#NA1
- **Rank**: Platinum 1 (Peak: Platinum 2)
- **Level**: 263
- **Record**: 23W - 20L
- **K/D**: 0.98 | **ACS**: 218.1 | **ADR**: 144.4
- **HS%**: 15.9% | **Win%**: 52.3% | **KAST**: 69.0%
- **Top Agents**: Veto, Jett, Raze

## Tech Stack

- **Node.js** - JavaScript runtime
- **discord.js** - Discord API library
- **axios** - HTTP client for API calls
- **dotenv** - Environment variable management
- **HenrikDev Valorant API** - Valorant stats API

## Project Structure

```
valorant-discord-bot/
├── src/
│   ├── index.js                    # Main bot entry point
│   ├── commands/
│   │   ├── ping.js                 # /ping command
│   │   ├── valorantProfile.js       # /valorant-profile command
│   │   └── valorantRecent.js        # /valorant-recent command
│   ├── services/
│   │   └── valorantApi.js           # API calls & mock data
│   └── utils/
│       ├── embeds.js                # Discord embed builders
│       ├── formatters.js            # Stat formatting utilities
│       └── cache.js                 # In-memory cache with TTL
├── .env.example                    # Environment variables template
├── .gitignore                      # Git ignore rules
├── package.json                    # Dependencies & scripts
└── README.md                       # This file
```

## Quick Start

### 1. Install Dependencies

```bash
cd /path/to/val_discord_bot
npm install
```

### 2. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Give it a name (e.g., "Valorant Bot")
4. Go to the **Bot** tab
5. Click **Add Bot**
6. Under **TOKEN**, click **Copy** and save it

### 3. Set Bot Permissions

1. In the Discord Developer Portal, go to **OAuth2** → **URL Generator**
2. Select scopes: `bot`
3. Select permissions:
   - `Send Messages`
   - `Embed Links`
   - `Use Slash Commands`
4. Copy the generated URL

### 4. Invite Bot to Your Test Server

1. Open the generated URL in a browser
2. Select your test Discord server
3. Click **Authorize**

### 5. Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in:
   ```
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_test_server_guild_id_here
   HENRIK_API_KEY=your_henrik_api_key_here (optional)
   USE_MOCK_DATA=true
   ```

**Getting IDs:**
- **DISCORD_CLIENT_ID**: From Developer Portal → General Information
- **DISCORD_GUILD_ID**: Right-click your Discord server and **Copy Server ID** (enable Developer Mode first)

### 6. Run the Bot

```bash
npm start
```

You should see:
```
[BOT] ✓ Logged in as YourBotName#1234
[BOT] ✓ Bot ID: 1234567890
[BOT] ✓ Total commands loaded: 3
[ENV] USE_MOCK_DATA: true
[BOT] Bot is ready to use!
```

## Testing the Bot

### Test 1: /ping

In your Discord server, type:
```
/ping
```

Expected response: `Pong! 🏓`

### Test 2: /valorant-profile (Mock Data)

```
/valorant-profile name:SongSiDiYa tag:NA1 region:na
```

Expected: Discord embed with profile stats including rank, K/D, ACS, etc.

### Test 3: /valorant-recent (Mock Data)

```
/valorant-recent name:SongSiDiYa tag:NA1 region:na
```

Expected: 5 embeds showing recent matches with agent, map, score, K/D/A, and ACS.

### Test 4: Invalid Input

Try:
```
/valorant-profile name:NonExistentPlayer tag:XX1 region:na
```

Expected: Clean error embed saying player not found.

## Using Real API Data

To use real Valorant stats instead of mock data:

1. Get an API key from [HenrikDev Valorant API](https://docs.henrikdev.gg/)
2. Update `.env`:
   ```
   HENRIK_API_KEY=your_real_api_key
   USE_MOCK_DATA=false
   ```
3. Restart the bot

The bot will now call the real API for actual player stats.

## Commands Reference

### /ping
- **Description**: Health check
- **Options**: None
- **Response**: "Pong! 🏓"

### /valorant-profile
- **Description**: Display player profile stats
- **Options**:
  - `name` (required): Player name (Riot ID)
  - `tag` (required): Player tag (e.g., NA1)
  - `region` (optional): Region - na, eu, br, latam, kr, jp, ap (default: na)
- **Response**: Embed with profile stats

### /valorant-recent
- **Description**: Display recent matches
- **Options**:
  - `name` (required): Player name (Riot ID)
  - `tag` (required): Player tag (e.g., NA1)
  - `region` (optional): Region (default: na)
- **Response**: Up to 5 embeds showing recent matches

## How It Works

### Command Flow

1. **User sends slash command** → Discord
2. **Discord sends interaction** → Your bot
3. **Bot defers reply** (prevents timeout)
4. **Bot fetches data** (mock or API)
5. **Bot formats data** into embeds
6. **Bot sends embeds** to Discord

### Caching

- Player profile data: **5-minute TTL**
- Recent matches: **5-minute TTL**
- Reduces API calls and improves response time

### Error Handling

- Invalid region → Error embed
- Player not found → Error embed
- API timeout → Error embed
- Missing API key → Falls back to mock data (if enabled)

## Development Tips

### Enable Debug Logging

The bot logs all events:
- `[BOT]` - Bot initialization
- `[COMMAND]` - Command execution
- `[CACHE HIT]` - Data from cache
- `[MOCK DATA]` - Mock data used
- `[ERROR]` - Errors

### View Logs

Check the terminal output while the bot is running:
```
[BOT] ✓ Logged in as YourBot#1234
[COMMAND] Executing: ping
[COMMAND] Executing: valorant-profile
[CACHE HIT] Profile for SongSiDiYa#NA1
```

### Testing Different Regions

```
/valorant-profile name:SongSiDiYa tag:NA1 region:eu
/valorant-profile name:SongSiDiYa tag:NA1 region:kr
```

### Testing Error Cases

```
# Invalid region
/valorant-profile name:Test tag:NA1 region:invalid

# Empty name
/valorant-profile name: tag:NA1 region:na

# Player not found (real API only, with USE_MOCK_DATA=false)
/valorant-profile name:PlayerThatDoesntExist tag:FAKE region:na
```

## Files Overview

### `src/index.js`
- Loads all commands from `/commands` folder
- Registers slash commands with Discord
- Handles interactions and command execution

### `src/commands/ping.js`
- Simple health check command
- No API calls

### `src/commands/valorantProfile.js`
- Slash command for `/valorant-profile`
- Validates input (name, tag, region)
- Calls `valorantApi.getPlayerProfile()`
- Creates profile embed

### `src/commands/valorantRecent.js`
- Slash command for `/valorant-recent`
- Calls `valorantApi.getRecentMatches()`
- Creates match embeds for each recent game

### `src/services/valorantApi.js`
- `getPlayerProfile()` - Fetches player stats
- `getRecentMatches()` - Fetches recent matches
- `isValidRegion()` - Validates region input
- Includes mock data for testing
- Implements caching

### `src/utils/embeds.js`
- `createProfileEmbed()` - Player profile embed
- `createMatchEmbed()` - Single match embed
- `createErrorEmbed()` - Error messages

### `src/utils/formatters.js`
- Format ratios, percentages, K/D, ACS, ADR
- Format rank, match score, damage adjustment

### `src/utils/cache.js`
- In-memory cache class with TTL
- `set()`, `get()`, `clear()` methods
- Automatic expiration

## Common Issues & Solutions

### Bot Not Responding

**Problem**: Commands don't appear in Discord
- **Solution**: Make sure `DISCORD_GUILD_ID` is correct and bot is in the server

**Problem**: "This interaction failed"
- **Solution**: Check the terminal for error messages. Make sure all `.env` variables are set.

### API Key Issues

**Problem**: "Invalid API key"
- **Solution**: Get a free API key from [HenrikDev Valorant API](https://docs.henrikdev.gg/)

**Problem**: Rate limited
- **Solution**: The API has rate limits. Use mock data mode or wait before making requests.

### Discord Token Error

**Problem**: "Invalid token"
- **Solution**: Copy the bot token exactly from the Developer Portal

## Next Steps (Not in v1)

- Add a database for user preferences
- Add a dashboard for bot management
- Deploy to a cloud server (Heroku, Railway, etc.)
- Add more commands (/compare players, /agent stats, etc.)
- Add error tracking (Sentry)

## License

MIT

## Support

This is a student portfolio project. For the real Tracker.gg, visit [tracker.gg](https://tracker.gg).

For API documentation, see [HenrikDev Valorant API](https://docs.henrikdev.gg/).
