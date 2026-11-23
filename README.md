# VALORANT Ranked Report + Coach for Discord

Run `/valorant-profile` to see how your recent ranked games went, who you queued with, and which situations are worth reviewing. One card opens with a plain-English recap and gives you the match and round counts behind it.

## Run the bot

Use Node.js 22, a Discord bot invited to your server with slash command support, and your own HenrikDev API key for live stats. Clone the repository and run the commands below from its directory.

```bash
git clone https://github.com/ChristopherDSBarker/val_bot_api_data_tracker.git
cd val_bot_api_data_tracker
npm ci
cp -n .env.example .env
```

Fill in `.env` with your Discord bot token (`DISCORD_TOKEN`), application ID (`DISCORD_CLIENT_ID`), server ID (`DISCORD_GUILD_ID`), and HenrikDev key (`HENRIK_API_KEY`). Set `USE_MOCK_DATA=false` for live results. Keep `.env` private.

```bash
ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=true npm start
```

Run the report in Discord:

```text
/valorant-profile name:SongSiDiYa tag:NA1 region:na
```

Use the region where the player competes. Region defaults to `na`. The bot registers commands in the server configured in `.env` when it starts.

## Read the card

| Section | What it tells you |
| --- | --- |
| **At a glance** | Your current rank, Rank Rating (RR), career peak, wins in the recent sample, and net RR over the displayed updates. |
| **Coach · Latest Match** | Explains how your team did after either side got the first kill and gives you one replay question. Your own opening kills appear separately when the API identifies the player. |
| **Latest Session** | Groups recent matches until a break of more than 90 minutes. It reports wins and the sum of RR changes linked to those matches, with coverage. If duration is missing, the gap uses the match start times. |
| **Recent Competitive** | Up to ten completed matches with result, score, map, agent, kills/deaths/assists, Average Combat Score (ACS), Performance Score, and match-linked RR when available. |
| **How Often Did Your Team Win the Round?** | Wins and known rounds on attack, on defense, and after either team got the first kill. A round can appear in both a side row and a first-kill row. |
| **Competitive Maps** | Matches won, average Performance Score with its match count, and rounds won by side. These are observed map results. Riot's private Map Rating is a separate number. |
| **How You Played Together** | One row per player. Party rows count confirmed games queued together. Team rows describe same-team results when there is no confirmed party record. A trade means a teammate killed your killer within five seconds in the same round. The trade denominator is games with usable kill records. |
| **Career and Act Accolades** | Lifetime Rank Legacy counts, API mastery levels with cutoff ties, top lifetime accolades, and accolades for the act linked to the latest match when HenrikDev returns that act. |
| **Sample Leaders and Economy** | Recent agent, role, and party records, named gun kills, credits spent per round, and equipment value per round. Gun kill counts show logged results. The bot does not know time spent using each gun. |
| **Compare Your Recent Games** | Compares the earlier and later five-match blocks in one act, matching by map, agent, and side. Each row needs ten known rounds per block. If exact matches are sparse, it checks by agent role and side. The table shows the change in percentage points. |

**Reading a result:** `1/5 (20%)` means one win in five known results. A small sample can suggest a replay worth reviewing. It can't tell you that a teammate, agent, or purchase caused the outcome.

The round section also tells you, in plain English, how often your team won after getting or giving up the first kill. The economy table separates your purchases from the value of gear you carried. It shows your credits spent per team round won and your damage per 1,000 credits spent. Each ratio uses only matches with both required inputs and displays its match count. The party comparison shows match wins with and without a confirmed party partner in the recent window. Games with incomplete party records are excluded from the queued-apart count. Weapon choice, saved gear, opponents, and teammates can all affect the observed results.

The card shows headshots as a share of **recorded hits**. It shows damage delta per round only when damage dealt, damage received, and round counts support the calculation. Dashes and “unavailable” indicate missing data.

## Troubleshoot and test

- If commands are missing, check the configured application and server IDs and the bot's invite permissions.
- If the API is rate-limited, give it time before retrying. The bot shares duplicate requests and respects a cooldown.
- To troubleshoot with optional beta features disabled, run `ENABLE_EXPERIMENTAL_VALORANT_PIPELINE=false npm start`.
- For a mock profile, set `USE_MOCK_DATA=true`. Discord credentials are still required for Discord login.
- Run the local regression suite with `npm test`. The tests run without a Discord login or API key. On GitHub, the clean-install workflow runs `npm ci` and `npm test` on pushes and pull requests.

If a report needs more space, use **Previous** and **Next** to read all pages in the same Discord reply. The controls are available to the requester for five minutes. Party comparisons appear inside **How You Played Together**. The experimental pipeline defaults to enabled and can be disabled with the startup command above.

## Data coverage

HenrikDev supplies the account, rank, RR history, matches, mastery, and accolade data. The bot uses match v4 with a v3 fallback and RR history v2 with a v1 fallback. HenrikDev's v4 match route caps each response at ten matches. The report reads one recent window and does not maintain longitudinal history.

The November 22, 2026 audit used Riot's 13.10 notes and HenrikDev's endpoint contract. See the [patch review](knowledge/valorant-13.10.md) and [API field inventory](knowledge/henrikdev-analytics-inventory.md) for the source fields, verification notes, and remaining gaps. The card mirrors supported match results, visible rank and RR, mastery, Rank Legacy, and accolades where the API returns them. Official Map Rating, calibration, Act border progress, and hidden matchmaking rating remain in-game values or unverified fields for this bot. Coach cues use observed round results to pick a replay question. The bot cannot observe whether you followed a cue or what caused the match result.

### Optional saved party history

The bot builds a local history from completed matches returned by profile lookups. Set `ENABLE_MATCH_HISTORY=false` in `.env` to stop collecting. The bot starts with the matches it sees after enabling the option. It shows a saved same-act comparison for partners identified in the recent report once it has five known matches together and ten verified matches apart. Unknown party status stays out of the apart count. The recent sections remain available during history collection.

The bot stores the match records in `data/matches.jsonl`, which is ignored by Git. It stores guild IDs, guild-scoped hashes of player identifiers, and match statistics. It does not store Riot names or Discord requester IDs in match records. The store is intended for one bot process. Setting the flag to false stops collection and leaves existing records on disk.

## Coaching is part of the report

Run the usual `/valorant-profile` using your Riot ID and region. The report automatically includes a replay cue for the latest match with a known result, a session recap when there are enough dated matches, and comparisons where the API has enough data. The teammate table uses confirmed party information from match records. When at least ten rounds have known opening outcomes, the coach can tailor its replay question to the agent’s role. Roles come from a bundled public agent catalog and refresh in the background. Role and first-kill comparisons describe the sample and should be read with their counts.

The role readout compares match win rates with your own recent baseline. It names a leading role only when at least two roles each have three known results. A single-map sample is labeled, and role-specific round counts appear when enough round data is available.

The Coach section separates **your first kills per known opening** from **team rounds won after getting the first kill**. When the latest match has at least ten known openers and two earlier matches in the same act and role supply at least ten more, it shows a personal baseline and the change in percentage points.
