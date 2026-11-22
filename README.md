# VALORANT Ranked Report for Discord

Run `/valorant-profile` to see how your recent ranked games went, who you queued with, and which situations are worth reviewing. One card opens with a plain-English recap and gives you the match and round counts behind it.

## Run the bot

You'll need Node.js, a Discord bot invited to your server with slash command support, and a HenrikDev API key for live stats.

```bash
npm install
cp -n .env.example .env
```

Fill in `.env` with your Discord bot token (`DISCORD_TOKEN`), application ID (`DISCORD_CLIENT_ID`), server ID (`DISCORD_GUILD_ID`), and HenrikDev key (`HENRIK_API_KEY`). Set `USE_MOCK_DATA=false` for live results. Keep `.env` private.

```bash
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=true npm start
```

Try `/ping` to check that the bot responds. Then try:

```text
/valorant-profile name:SongSiDiYa tag:NA1 region:na
```

Use the region where the player competes. Region defaults to `na`. Add `friend:Name#TAG` to highlight a player you know in that report. The bot registers commands in the server configured in `.env` when it starts.

## Read the card

| Section | What it tells you |
| --- | --- |
| **At a glance** | Your current rank, Rank Rating (RR), career peak, wins in the recent sample, and net RR over the displayed updates. |
| **Recent Competitive** | Up to ten completed matches with result, score, map, agent, kills/deaths/assists, Average Combat Score (ACS), Performance Score, and match-linked RR when available. |
| **How Often Did Your Team Win the Round?** | Wins and known rounds on attack, on defense, and after either team got the first kill. A round can appear in both a side row and a first-kill row. |
| **Competitive Maps** | Matches won, average Performance Score with its match count, and rounds won by side. These are observed map results. Riot's private Map Rating is a separate number. |
| **How You Played Together** | One row per player. Party rows count confirmed games queued together. Team rows describe same-team results when there is no confirmed party record. A trade means a teammate killed your killer within five seconds in the same round. The trade denominator is games with usable kill records. |
| **Career and Act Accolades** | Lifetime Rank Legacy counts, API mastery levels with cutoff ties, top lifetime accolades, and accolades for the act linked to the latest match when HenrikDev returns that act. |
| **Sample Leaders and Economy** | Recent agent and party records, named gun kills, credits spent per round, and equipment value per round. Gun kill counts show logged results. The bot does not know time spent using each gun. |
| **Compare Your Recent Games** | Compares the earlier and later five-match blocks in one act, matching by map, agent, and side. Each row needs ten known rounds per block. |

**Reading a result:** `1/5 (20%)` means one win in five known results. A small sample can suggest a replay worth reviewing. It can't tell you that a teammate, agent, or purchase caused the outcome.

The card shows headshots as a share of **recorded hits**. It shows damage delta per round only when damage dealt, damage received, and round counts support the calculation. Dashes and “unavailable” indicate missing data.

## Troubleshoot and test

- If commands are missing, check the configured application and server IDs and the bot's invite permissions.
- If the API is rate-limited, give it time before retrying. The bot shares duplicate requests and respects a cooldown.
- To troubleshoot with optional beta features disabled, run `ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=false npm start`.
- For a mock profile, set `USE_MOCK_DATA=true`. Discord credentials are still required for Discord login.
- Run the local regression suite with `npm test`. The tests run without a Discord login.

If a report exceeds the card’s space, additional sections go into an attached `ranked-report-details.txt` file. The bot needs the server’s **Attach Files** permission to send it. The experimental pipeline defaults to enabled and can be disabled with the startup command above.

## Data coverage

HenrikDev supplies the account, rank, RR history, matches, mastery, and accolade data. The bot uses match v4 with a v3 fallback and RR history v2 with a v1 fallback. HenrikDev's v4 match route caps each response at ten matches. The report reads one recent window and does not maintain longitudinal history.

The November 22, 2026 audit used Riot's 13.10 notes and HenrikDev's endpoint contract. See the [patch review](knowledge/valorant-13.10.md) and [API field inventory](knowledge/henrikdev-analytics-inventory.md) for the source fields, verification notes, and remaining gaps. Official Map Rating, calibration, Act border progress, and hidden matchmaking rating remain in-game values or unverified fields for this bot.
