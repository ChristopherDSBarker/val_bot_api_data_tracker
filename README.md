# Valorant Discord Bot

A Discord Valorant profile bot built with Node.js, discord.js, and the HenrikDev API.

The bot provides one main player command:

```text
/valorant-profile
```

`/ping` is also available as a basic health check.

## What It Shows

`/valorant-profile` displays a Valorant profile card with:

- rank, RR, and peak rank
- recent competitive record
- combat stats
- recent matches
- RR trend
- MMR Signal
- DDΔ
- account level, region, and peak season

## Install

```bash
npm install
```

## Start Best Version

Recommended:

```bash
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=true npm start
```

This enables:

- PUUID/v4 experimental sidecar
- safer v4 match enrichment
- DDΔ support when damage data is available
- stable profile fallback if experimental data fails

The stable `/valorant-profile` path remains the fallback. Experimental data should enrich the profile only when it is usable.

## Emergency Stable-Only Fallback

If experimental API calls cause rate limits or issues, run:

```bash
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=false npm start
```

or:

```bash
unset ENABLE_EXPERIMENTAL_VALORANT_PIPELINE
npm start
```

Use stable-only mode for troubleshooting. The recommended startup command is still:

```bash
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=true npm start
```

## Environment Variables

Create a `.env` file with the expected variable names. Do not commit real secrets.

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
HENRIK_API_KEY=
USE_MOCK_DATA=false
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=true
DEBUG_VALORANT_API=false
```

Depending on your local setup, the bot may also expect Discord variable names with the `DISCORD_` prefix:

```env
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

## Discord Usage

Main command:

```text
/valorant-profile name:<riot-name> tag:<tag> region:<region>
```

Examples:

```text
/valorant-profile name:SiDi254 tag:NA1 region:na
/valorant-profile name:SongSiDiYa tag:NA1 region:na
/valorant-profile name:Lizzi NomNom tag:NA1 region:na
```

Health check:

```text
/ping
```

## MMR Signal Disclaimer

MMR Signal is not Riot hidden MMR.

It is an estimate from visible rank, RR trend, recent results, and round differential. The bot does not expose exact Riot hidden MMR.

## DDΔ Disclaimer

DDΔ means damage delta per round.

It is only shown as a number when damage dealt, damage received, and rounds are proven from HenrikDev data. Otherwise it shows `N/A`.

The bot does not fake DDΔ.

## Rate Limits

HenrikDev may rate-limit during rapid testing.

If you test many profiles quickly and see partial data, wait a few minutes and retry. Use stable-only fallback if needed.

## Project Structure

```text
valorant-discord-bot/
├── src/
│   ├── index.js
│   ├── commands/
│   │   ├── ping.js
│   │   └── valorantProfile.js
│   ├── services/
│   │   └── valorantApi.js
│   └── utils/
│       ├── cache.js
│       ├── embeds.js
│       └── formatters.js
├── package.json
└── README.md
```

## Troubleshooting

If commands do not appear in Discord, confirm the bot is invited to the correct guild and the guild/application IDs are correct.

If the bot returns partial profile data during testing, check for HenrikDev rate limits and retry after a few minutes.

If experimental enrichment causes problems, start with stable-only fallback and verify `/valorant-profile` before re-enabling the experimental pipeline.
